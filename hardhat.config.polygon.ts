// Hardhat configuration for Polygon Mainnet deployment with high gas limits
// Add this to your hardhat.config.ts or create a separate config

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    polygon: {
      url: "https://polygon-rpc.com", // Use a reliable RPC endpoint
      accounts: [process.env.PRIVATE_KEY!],
      gasPrice: "auto",
      gas: 50000000, // 50M gas limit
      timeout: 600000, // 10 minutes timeout
      httpHeaders: {
        "User-Agent": "Hardhat"
      }
    },
    // Alternative RPC endpoints with higher gas limits
    polygonAlchemy: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY!],
      gasPrice: "auto",
      gas: 50000000,
      timeout: 600000,
    },
    polygonInfura: {
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY!],
      gasPrice: "auto",
      gas: 50000000,
      timeout: 600000,
    }
  },
  etherscan: {
    apiKey: {
      polygon: process.env.POLYGONSCAN_API_KEY!,
    },
  },
};

export default config;
