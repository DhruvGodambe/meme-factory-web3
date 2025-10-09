# Meme Factory Web3 - Uniswap v4 Integration# Sample Hardhat Project



A Solidity smart contract system implementing a restricted ERC20 token with fee mechanics integrated with Uniswap v4 hooks.This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.



## 🎯 FeaturesTry running some of the following tasks:



- **RestrictedToken**: ERC20 token with built-in trading restrictions and fee mechanism```shell

  - 10% fee on all trades through the hooknpx hardhat help

  - Owner-controlled trading enable/disablenpx hardhat test

  - Whitelist-based access control for trading venuesREPORT_GAS=true npx hardhat test

  - 1,000,000 initial supplynpx hardhat node

npx hardhat ignition deploy ./ignition/modules/Lock.ts

- **FeeHook**: Uniswap v4 hook for managing swaps```

  - Implements `beforeSwap` hook
  - Validates swap operations
  - Tracks swap events
  - Integrates with RestrictedToken fee mechanism

## 📦 Tech Stack

- Solidity ^0.8.24
- Hardhat v2
- TypeScript
- Ethers.js v6
- Uniswap v4 Core & Periphery
- OpenZeppelin Contracts

## 🚀 Getting Started

### Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
```

### Installation

1. Install dependencies
```bash
npm install
```

2. Create environment file
```bash
cp .env.example .env
```

3. Edit `.env` with your configuration:
```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR-PROJECT-ID
PRIVATE_KEY=your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key_here
UNISWAP_V4_POOL_MANAGER=0x... # Update when available
```

### Compilation

```bash
npx hardhat compile
```

### Testing

```bash
# Run all tests
npx hardhat test

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run specific test file
npx hardhat test test/RestrictedToken.test.ts
```

### Deployment

#### Local Deployment (Hardhat Network)

```bash
npx hardhat run scripts/deploy.ts
```

#### Sepolia Testnet Deployment

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

#### Verify Contracts on Etherscan

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

### Interaction

After deployment, use the interaction script:

```bash
npx hardhat run scripts/interact.ts --network sepolia
```

## 📝 Contract Architecture

### RestrictedToken

```solidity
// Main functions
setAllowedAddresses(address _hook, address _poolManager) // Owner only
enableTrading(bool _status) // Owner only
transfer(address to, uint256 amount) // With restrictions
```

**Fee Mechanism:**
- 10% fee applied on transfers via the hook
- Fee sent to contract owner/treasury
- No fee on owner transfers
- No fee when trading is disabled

### FeeHook

```solidity
// Main functions
beforeSwap(...) // Called by PoolManager before each swap
setFeeReceiver(address _feeReceiver) // Update fee receiver
getHookPermissions() // Returns hook configuration
```

**Hook Permissions:**
- `beforeSwap`: ✅ Enabled
- All other hooks: ❌ Disabled

## 🧪 Testing

The test suite covers:
- ✅ Deployment and initialization
- ✅ Access control
- ✅ Token transfers (before & after trading)
- ✅ Fee calculations
- ✅ Trading restrictions
- ✅ Hook integration

Run tests with coverage:
```bash
npx hardhat coverage
```

## 📊 Contract Addresses

After deployment, addresses are saved to `deployment-info.json`

## ⚠️ Important Notes

### Uniswap v4 Status

Uniswap v4 is in development. For production:
1. Wait for official v4 deployment on Sepolia
2. Update `UNISWAP_V4_POOL_MANAGER` in `.env`
3. Initialize liquidity pool through v4 interfaces

### Security Considerations

- **Private Keys**: Never commit `.env` with real keys
- **Testing**: Test thoroughly on testnet before mainnet
- **Audit**: Consider professional audit for production
- **Access Control**: Ensure proper ownership mechanisms
- **Fee Logic**: Verify fee calculations are correct

## 🛠️ Development

### Project Structure

```
meme-factory-web3/
├── contracts/
│   ├── RestrictedToken.sol      # Main ERC20 token with restrictions
│   └── FeeHook.sol               # Uniswap v4 hook implementation
├── test/
│   └── RestrictedToken.test.ts  # Comprehensive test suite
├── scripts/
│   ├── deploy.ts                 # Deployment script
│   └── interact.ts               # Interaction script
├── hardhat.config.ts             # Hardhat configuration
└── package.json                  # Dependencies
```

## 📄 License

MIT

## 📚 Resources

- [Uniswap v4 Documentation](https://docs.uniswap.org/contracts/v4/overview)
- [Hardhat Documentation](https://hardhat.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Ethers.js Documentation](https://docs.ethers.org/)

---

**⚠️ Disclaimer**: This is experimental software. Use at your own risk. Test thoroughly on testnets before mainnet deployment.
