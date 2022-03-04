import Web3 from "web3"; // Web3
import axios from "axios"; // Axios requests
import bs58 from "bs58"; // bs58 cryptography for decode ipfs hash

import {
  DYDX_ABI,
  DYDX_ADDRESS,
  GOVERNOR_ABI,
  GOVERNOR_ADDRESS,
  MULTICALL_ABI,
  MULTICALL_ADDRESS,
} from "helpers/abi"; // Contract ABIs + Addresses

/// Global defining key values for proposal states
const statesKey = [
  "Pending", // creation block
  "Canceled", // cancelation block
  "Active", // start block
  "Failed", // end block
  "Succeeded", // end block
  "Queued", // executionETA - 2 days
  "Expired",
  "Executed", // execution block
];

/**
 * Instantiates server-side web3 connection
 */
const Web3Handler = () => {
  // Setup web3 handler
  const web3 = new Web3(process.env.NEXT_PUBLIC_INFURA_RPC);

  // Setup contracts
  const multicall = new web3.eth.Contract(MULTICALL_ABI, MULTICALL_ADDRESS);
  const dydxToken = new web3.eth.Contract(DYDX_ABI, DYDX_ADDRESS);
  const governor = new web3.eth.Contract(GOVERNOR_ABI, GOVERNOR_ADDRESS);

  // Return web3 + contracts
  return {
    web3,
    dydxToken,
    governor,
    multicall,
  };
};

export default async (req, res) => {
  let { page_number = 1, page_size = 10, get_state_times = false } = req.query;
  page_size = Number(page_size);
  page_number = Number(page_number);
  const { web3, dydxToken, governor, multicall } = Web3Handler();
  const proposalCount = Number(
    await governor.methods.getProposalsCount().call()
  );

  const offset = (page_number - 1) * page_size;

  let graphRes, states;
  let resData = {};

  let pagination_summary = {};

  pagination_summary.page_number = Number(page_number);
  pagination_summary.total_pages = Math.ceil(proposalCount / page_size);

  if (page_number < 1 || page_number > pagination_summary.total_pages) {
    res.status(400).send("Invalid page number");
    return;
  }

  pagination_summary.page_size = page_size;
  pagination_summary.total_entries = proposalCount;
  resData.pagination_summary = pagination_summary;

  [graphRes, states] = await Promise.all([
    axios.post(
      "https://api.thegraph.com/subgraphs/name/arr00/dydx-governance",
      {
        query:
          `{
          proposals(first:` +
          page_size +
          ` skip:` +
          offset +
          ` orderBy:startBlock orderDirection:desc) {
            id
            ipfsHash
            creationTime
            startBlock
            endBlock
            queuedTime
            executionTime
            cancellationTime
            executionETA
          }
        }`,
      }
    ),
    multicall.methods
      .aggregate(
        genCalls(
          GOVERNOR_ADDRESS,
          "0x9080936f", //TODO: Find getProposalsState hex
          proposalCount - 1 - offset,
          Math.max(-1, proposalCount - offset - page_size),
          web3
        )
      )
      .call(),
  ]);

  let stringStates = [];
  for (const state of states["returnData"]) {
    stringStates.push(statesKey[Number(state[state.length - 1])]);
  }
  let proposalData = [];
  for (const proposal of graphRes.data.data.proposals) {
    let newProposal = {};
    newProposal.ipfs_hash = encodeIpfsHash(proposal.ipfsHash);
    const ipfsData = await pullIpfsHash(newProposal.ipfs_hash); // Should parallelize these fetches
    newProposal.title = ipfsData.title;
    newProposal.id = proposal.id;
    newProposal.dydx_url =
      "https://dydx.community/dashboard/proposal/" + proposal.id;

    const currentState = stringStates.shift();
    let time = null;
    if (get_state_times == "true" || get_state_times == true) {
      time = await getTimeFromState(currentState, proposal, web3);
    }
    let stateObj = { value: currentState, start_time: time };

    newProposal.state = stateObj;
    proposalData.push(newProposal);
  }
  resData.proposals = proposalData;
  res.json(resData);
};

/**
 * Generate hex calls for a call signature and a range of uint256 parameter input
 * @param {String} target Contract to call
 * @param {String} callPrefix Function hex sig
 * @param {Number} last Last input
 * @param {Number} first First input (not inclusive)
 * @param {Web3} web3 Web3 instance, used for encoding parameters
 * @returns [] Call input for multicall
 */
function genCalls(target, callPrefix, last, first, web3) {
  let res = [];
  for (let i = last; i > first; i--) {
    res.push({
      target: target,
      callData:
        callPrefix + web3.eth.abi.encodeParameter("uint256", i).substring(2),
    });
  }
  return res;
}

async function getTimeFromState(state, proposal, web3) {
  let blockToFetch;
  let time = null;

  switch (state) {
    case "Pending":
      time = parseInt(proposal.creationTime);
      break;
    case "Active":
      blockToFetch = proposal.startBlock;
      break;
    case "Canceled":
      time = parseInt(proposal.cancellationTime);
      break;
    case "Failed":
      blockToFetch = proposal.endBlock;
      break;
    case "Succeeded":
      blockToFetch = proposal.endBlock;
      break;
    case "Queued":
      time = parseInt(proposal.executionETA) - 60 * 60 * 24 * 2; // two days
      break;
    case "Expired":
      time = parseInt(proposal.executionETA) + 1209600; // Grace period of 2 weeks
      break;
    case "Executed":
      time = parseInt(proposal.executionTime);
      break;
    default:
      console.log("fatal error");
      console.log("state is " + state);
  }

  if (time == null) {
    const block = await web3.eth.getBlock(blockToFetch);
    return block.timestamp;
  }

  return time;
}

async function pullIpfsHash(ipfsHash) {
  const res = await axios.get("https://gateway.pinata.cloud/ipfs/" + ipfsHash);
  return res.data;
}

function encodeIpfsHash(encodedIpfsHash) {
  const fromHexString = (hexString) =>
    new Uint8Array(
      hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
    );
  let array = fromHexString(encodedIpfsHash);
  array[0] = 32;
  array = Array.from(array);
  array.unshift(18);
  return bs58.encode(array);
}
