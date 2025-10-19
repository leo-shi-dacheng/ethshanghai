// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIdentityRegistry {
    function isVerified(address user) external view returns (bool);
    function getIdentity(address user) external view returns (address);
}

