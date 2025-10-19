// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IClaimsRegistry {
    function hasClaim(address identity, bytes32 claimType) external view returns (bool);
    function getClaim(address identity, bytes32 claimType) external view returns (bytes32);
}

