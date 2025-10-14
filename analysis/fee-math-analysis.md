# FeeHook Fee Math Analysis

## Current Issues Identified

### 1. **Unidirectional Fee Collection**
- **Problem**: Fees are only collected when buying RST (ETH → RST), not when selling RST (RST → ETH)
- **Code Location**: Lines 133-149 in `_afterSwap`
- **Impact**: Inconsistent fee behavior, users can avoid fees by selling RST

### 2. **Delta Sign Confusion**
- **Problem**: The logic assumes `rstAmount > 0` but deltas can be negative
- **Code Location**: Line 149 `if (isSwapToRst && rstAmount > 0)`
- **Impact**: May miss fee collection when delta signs are unexpected

### 3. **Fee Calculation Issues**
- **Problem**: Fee is calculated on output amount, but delta handling may be incorrect
- **Code Location**: Line 151 `uint256 feeAmount = (uint256(int256(rstAmount)) * FEE_PERCENT) / 100;`
- **Impact**: Incorrect fee amounts, potential arithmetic errors

### 4. **Missing Bidirectional Logic**
- **Problem**: No logic to handle fees when selling RST for ETH
- **Impact**: Users can trade RST → ETH without paying fees

## Detailed Analysis

### Current Logic Flow:
1. Check if swap is TO RST (buying RST)
2. If yes, calculate 10% fee on RST output
3. Return negative delta to reduce user's RST output
4. If no, no fee is collected

### Problems with Current Approach:

#### A. Delta Sign Issues
```solidity
// Current problematic logic
if (params.zeroForOne && rstIsCurrency1) {
    rstAmount = delta.amount1(); // Could be negative!
}
```

#### B. Unidirectional Fee Collection
```solidity
// Only handles buying RST, not selling RST
if (isSwapToRst && rstAmount > 0) {
    // Fee logic here
}
// Missing: What about selling RST?
```

#### C. Fee Math Confusion
```solidity
// Converting signed to unsigned without proper checks
uint256 feeAmount = (uint256(int256(rstAmount)) * FEE_PERCENT) / 100;
```

## Recommended Fixes

### 1. **Implement Bidirectional Fee Collection**
- Collect fees on BOTH buying and selling RST
- Use different logic for each direction

### 2. **Fix Delta Handling**
- Properly handle negative deltas
- Use absolute values for fee calculations

### 3. **Correct Fee Math**
- Ensure proper sign handling
- Calculate fees on the correct amounts

### 4. **Simplify Logic**
- Make the fee collection more predictable
- Ensure consistent 10% fee regardless of direction

## Test Cases Needed
1. ETH → RST swap (buying RST) - should charge 10% fee
2. RST → ETH swap (selling RST) - should charge 10% fee  
3. Verify price impact shows exactly 10% in both directions
4. Ensure no "swap may fail" warnings
5. Verify fee collection in treasury