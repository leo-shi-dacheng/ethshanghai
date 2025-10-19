// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

abstract contract DebtTokenLifecycle is Ownable {
    // 债权生命周期状态
    bool public interestPaid;
    bool public principalRedeemed;

    // 事件
    event InterestPaid(uint256 timestamp, string message);
    event PrincipalRedeemed(uint256 timestamp, string message);

    // 声明 onlyOwner 修饰符由上层合约提供（Ownable）

    /**
     * @dev 模拟向代币持有者支付利息。只能由拥有者调用。
     */
    function payInterest() public virtual onlyOwner {
        require(!interestPaid, unicode"DebtToken: 本期利息已支付。");
        interestPaid = true;
        emit InterestPaid(block.timestamp, unicode"利息已分配给代币持有者。");
    }

    /**
     * @dev 模拟在到期时赎回本金。只能由拥有者调用。
     */
    function redeemPrincipal() public virtual onlyOwner {
        require(!principalRedeemed, unicode"DebtToken: 本金已赎回。");
        principalRedeemed = true;
        emit PrincipalRedeemed(block.timestamp, unicode"本金现已可供代币持有者赎回。");
    }
}
