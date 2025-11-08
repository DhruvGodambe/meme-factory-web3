import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26", // Required for tload/tstore (transient storage)
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      evmVersion: "cancun", // Enable Cancun EVM features including transient storage
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY",
      accounts: 
        process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 64
          ? [process.env.PRIVATE_KEY]
          : [],
      chainId: 11155111,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/YOUR-API-KEY",
      accounts: 
        process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 64
          ? [process.env.PRIVATE_KEY]
          : [],
      chainId: 137,
      gasPrice: 120000000000, // 120 gwei
      gas: 8000000,
      timeout: 200000, // 200 seconds
    },
    base: {
      url: process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org",
      accounts: 
        process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 64
          ? [process.env.PRIVATE_KEY]
          : [],
      chainId: 8453,
      gasPrice: 1000000, // 0.001 gwei (Base is very cheap)
      gas: 3000000,
      timeout: 120000, // 120 seconds
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=11155111",
          browserURL: "https://sepolia.etherscan.io"
        }
      },
      {
        network: "polygon",
        chainId: 137,
        urls: {
          apiURL: "https://api.polygonscan.com/api",
          browserURL: "https://polygonscan.com"
        }
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://basescan.org"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;