// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IClaimsRegistry} from "../ClaimsRegistry.sol";

contract MockClaimsRegistry is IClaimsRegistry {
    // claims[identity][claimType] = value (非零即存在)
    mapping(address => mapping(bytes32 => bytes32)) public claims;

    function setClaim(address identity, bytes32 claimType, bytes32 value) external {
        claims[identity][claimType] = value; // 0 清空；非 0 即存在
    }

    function hasClaim(address identity, bytes32 claimType) external view returns (bool) {
        return claims[identity][claimType] != bytes32(0);
    }

    function getClaim(address identity, bytes32 claimType) external view returns (bytes32) {
        return claims[identity][claimType];
    }
}

