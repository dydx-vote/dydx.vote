import Web3 from "web3"; // Web3
import axios from "axios"; // Axios requests
import bs58 from "bs58"; // bs58 cryptography for decode ipfs hash
import {
  fetchProposals as fetchProposalsFromDb,
  addProposals,
  fetchCachedProposalsCount,
} from "helpers"; // canVote helper

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
  let { page_number = 1, page_size = 10 } = req.query;
  page_size = Number(page_size);
  page_number = Number(page_number);
  const offset = (page_number - 1) * page_size;
  let [proposalCount, cachedProposalCount] = await Promise.all([
    getProposalCountTheGraph(),
    fetchCachedProposalsCount(),
  ]);

  if (cachedProposalCount < proposalCount) {
    let newProposals = await fetchProposals(
      proposalCount - 1 /* proposal count starts at 0 */,
      cachedProposalCount /* inclusive */
    );
    await addProposals(newProposals); // Save new proposals to Mongodb
  }

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

  const proposalsPointer = await fetchProposalsFromDb(
    proposalCount - 1 - offset,
    page_size
  );
  const allProposals = (await proposalsPointer.toArray()).map((prop) => {
    delete prop._id;
    return prop;
  });
  const currentStates = await fetchProposalStates(
    proposalCount - 1 - offset,
    Math.max(proposalCount - 1 - offset - page_size, 0),
    allProposals
  );
  resData.proposals = allProposals.map((x, i) => {
    x.state = currentStates[i];
    return x;
  });

  res.json(resData);
};

/**
 * Pulls proposals in a descending order inclusive
 * @param {Number} last
 * @param {Number} first
 */
async function fetchProposals(last, first) {
  console.log("fetching proposals " + last + " first " + first);
  const graphRes = await axios.post(
    "https://api.thegraph.com/subgraphs/name/arr00/dydx-governance",
    {
      query:
        `{
          proposals(first:` +
        (last - first + 1) +
        ` where:{id_lte:` +
        last +
        `} orderBy:id orderDirection:desc) {
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
  );

  const proposalFetchers = graphRes.data.data.proposals.map(
    async (proposal, i) => {
      let newProposal = {};
      newProposal.ipfs_hash = decodeIpfsHash(proposal.ipfsHash);
      [newProposal.title, newProposal.basename] =
        await getProposalTitleAndBasenameFromIpfs(newProposal.ipfs_hash);
      newProposal.id = proposal.id;
      newProposal.dydx_url =
        "https://dydx.community/dashboard/proposal/" + proposal.id;
      newProposal.startBlock = proposal.startBlock;
      newProposal.strategy = proposal.strategy;
      
      return newProposal;
    }
  );
  const proposalData = await Promise.all(proposalFetchers);

  return proposalData.map((prop) => {
    prop.id = Number(prop.id);
    return prop;
  });
}

/**
 * Pull proposal count from the graph
 * @returns {Number} current proposal count from the graph
 */
async function getProposalCountTheGraph() {
  const proposalCount = await axios.post(
    "https://api.thegraph.com/subgraphs/name/arr00/dydx-governance",
    {
      query: `{
          governances(first: 1) {
            proposals
          }
        }`,
    }
  );
  return Number(proposalCount.data.data.governances[0].proposals);
}

/**
 *
 * @param {Number} last last proposal to fetch state for
 * @param {Number} first first proposal to fetch state for (inclusive)
 */
async function fetchProposalStates(last, first, proposals) {
  const { web3, multicall } = Web3Handler();
  const states = await multicall.methods
    .aggregate(genCalls(GOVERNOR_ADDRESS, "0x9080936f", last, first, web3))
    .call();
  const stringStates = states["returnData"].map((state) => {
    return statesKey[Number(state[state.length - 1])];
  });

  const stateObjs = stringStates.map((state) => {
    return { value: state };
  });

  return stateObjs;
}

/**
 * Generate hex calls for a call signature and a range of uint256 parameter input
 * @param {String} target Contract to call
 * @param {String} callPrefix Function hex sig
 * @param {Number} last Last input
 * @param {Number} first First input inclusive
 * @param {Web3} web3 Web3 instance, used for encoding parameters
 * @returns [] Call input for multicall
 */
function genCalls(target, callPrefix, last, first, web3) {
  let res = [];
  for (let i = last; i >= first; i--) {
    res.push({
      target: target,
      callData:
        callPrefix + web3.eth.abi.encodeParameter("uint256", i).substring(2),
    });
  }
  return res;
}

async function pullIpfsHash(ipfsHash) {
  // Pinata: https://gateway.pinata.cloud/ipfs/
  const res = await axios.get("https://ipfs.io/ipfs/" + ipfsHash);
  return res.data;
}

async function getProposalTitleAndBasenameFromIpfs(ipfsHash) {
  const ipfsData = await pullIpfsHash(ipfsHash);
  return [ipfsData.title, ipfsData.basename];
}

function decodeIpfsHash(encodedIpfsHash) {
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
