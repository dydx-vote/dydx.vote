import axios from "axios"; // Axios requests
import { web3p } from "containers"; // Web3
import { DYDX_ABI } from "helpers/abi"; // dYdX Token ABI
import { useState, useEffect } from "react"; // State management
import { createContainer } from "unstated-next"; // Unstated-next containerization

function useDelegate() {
  // Context
  const { web3, address } = web3p.useContainer();

  // Local state
  const [currentDelegate, setCurrentDelegate] = useState(null); // Current delegate

  /**
   * Generate delegation message
   * @param {string} delegatee address to delegate voting power to
   * @param {integer} nonce transaction nonce
   */
  const createDelegateBySigMessage = (delegatee, nonce = 0) => {
    // Types
    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Delegate: [
        { name: "delegatee", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "expiry", type: "uint256" },
      ],
    };

    // Return message to sign
    return JSON.stringify({
      types,
      primaryType: "Delegate",
      domain: {
        name: "dYdX",
        version: 1,
        chainId: 1,
        verifyingContract: "0x92D6C1e31e14520e676a687F0a93788B716BEff5",
      },
      // Message
      message: {
        // Delegatee address
        delegatee,
        nonce: nonce,
        expiry: 10e9,
      },
    });
  };

  /**
   * Returns promise of web3 signature
   * @param {string} msgParams to sign
   */
  const signDelegation = async (msgParams) => {
    // Return promise
    return new Promise((resolve, reject) => {
      // Sign message
      web3.currentProvider.sendAsync(
        {
          method: "eth_signTypedData_v4",
          params: [address, msgParams],
          from: address,
        },
        async (error, result) => {
          // If no error
          if (!error) {
            // Resolve promise with resulting signature
            resolve(result.result);
          } else {
            // Reject promise with resulting error
            reject(error);
          }
        }
      );
    });
  };

  /**
   * POSTS delegation to back-end
   * @param {string} delegatee address to delegate voting power to
   * @param {integer} nonce transaction nonce
   * @param {string} signedMsg from Web3
   */
  const castDelegation = async (delegatee, nonce, signedMsg) => {
    // Collect r, s, v
    const r = "0x" + signedMsg.substring(2, 66);
    const s = "0x" + signedMsg.substring(66, 130);
    const v = "0x" + signedMsg.substring(130, 132);

    // Post to back-end
    await axios
      .post("/api/delegate", {
        address,
        r,
        s,
        v,
        expiry: 10e9,
        delegatee,
        nonce,
      })
      // If successful
      .then(() => {
        // Alert successful
        alert("Success!");
      })
      // Else,
      .catch((error) => {
        // Alert error message
        alert("Error: " + error.response.data.message);
      });
  };

  /**
   * Create a delegation to delegatee
   * @param {string} delegate address to delegate voting power to
   */
  const createDelegation = async (delegatee) => {
    const dydx = new web3.eth.Contract(
      DYDX_ABI,
      "0x92D6C1e31e14520e676a687F0a93788B716BEff5"
    );

    // Collect interaction nonce
    const nonce = await dydx.methods.nonces(address).call();

    // Generate delegation message to sign
    const msgParams = createDelegateBySigMessage(delegatee, nonce);
    const signedMsg = await signDelegation(msgParams);

    // POST vote to server
    await castDelegation(delegatee, nonce, signedMsg);
  };

  /**
   * Checks if a user has an existing delegation
   */
  const checkDelegation = async () => {
    const dydx = new web3.eth.Contract(
      DYDX_ABI,
      "0x92D6C1e31e14520e676a687F0a93788B716BEff5"
    );

    // Collect current delegate
    const delegate = await dydx.methods.getDelegateeByType(address, 0).call();

    // Update delegate in state
    const noDelegate = "0x0000000000000000000000000000000000000000";
    if (delegate !== noDelegate) setCurrentDelegate(delegate);
  };

  // --> On address change (lock/unlock)
  useEffect(() => {
    // Set current delegate to null
    setCurrentDelegate(null);

    // If authenticated
    if (web3 && address) {
      // Recheck delegation status
      checkDelegation();
    }
  }, [address]);

  return {
    currentDelegate,
    createDelegation,
  };
}

// Create unstated-next container
const delegate = createContainer(useDelegate);
export default delegate;
