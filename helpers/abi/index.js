// Import contract abis
import DYDX_ABI from "helpers/abi/dydx.abi";
import SIG_RELAYER_ABI from "helpers/abi/SigRelayer.abi";
import GOVERNOR_ABI from "helpers/abi/Governor.abi";
import MULTICALL_ABI from "helpers/abi/multicall.abi";
import DYDX_STRATEGY_ABI from "helpers/abi/strategy.abi";

// Mainnet contract addresses
const SIG_RELAYER_ADDRESS = "0xf61d8eef3f479dfa24beaa46bf6f235e6e2f7af8";
const DYDX_ADDRESS = "0x92D6C1e31e14520e676a687F0a93788B716BEff5";
const MULTICALL_ADDRESS = "0xeefBa1e63905eF1D7ACbA5a8513c70307C1cE441";
const GOVERNOR_ADDRESS = "0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2";
const DYDX_STRATEGY_ADDRESS = "0xc2f5F3505910Da80F0592a3Cc023881C50b16505";

// Export as individual exports
export {
  DYDX_ABI,
  SIG_RELAYER_ABI,
  GOVERNOR_ABI,
  MULTICALL_ABI,
  SIG_RELAYER_ADDRESS,
  DYDX_ADDRESS,
  MULTICALL_ADDRESS,
  GOVERNOR_ADDRESS,
  DYDX_STRATEGY_ADDRESS,
  DYDX_STRATEGY_ABI
};
