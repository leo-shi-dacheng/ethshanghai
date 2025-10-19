// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IIdentityRegistry} from "../IdentityRegistry.sol";

contract MockIdentityRegistry is IIdentityRegistry {
    mapping(address => bool) public verified;
    mapping(address => address) public identityOf;

    function set(address user, address identity, bool v) external {
        identityOf[user] = identity;
        verified[user] = v;
    }

    function isVerified(address user) external view returns (bool) {
        return verified[user];
    }

    function getIdentity(address user) external view returns (address) {
        return identityOf[user];
    }
}

