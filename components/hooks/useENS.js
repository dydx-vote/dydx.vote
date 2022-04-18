import { ethers } from "ethers";
import { web3p } from "containers"; // Web3
import { useEffect, useState } from "react";

const useENS = (address) => {
  const [ensName, setENSName] = useState();
  const { web3 } = web3p.useContainer();

  useEffect(() => {
    const resolveENS = async () => {
      if (address) {
        const provider = new ethers.providers.Web3Provider(web3.currentProvider);
        const ensName = await provider.lookupAddress(address);
        setENSName(ensName);
      }
    };
    resolveENS();
  }, [address]);

  return { ensName };
};

export default useENS;
