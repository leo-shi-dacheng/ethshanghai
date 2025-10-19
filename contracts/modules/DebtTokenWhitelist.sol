// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

abstract contract DebtTokenWhitelist is Ownable {
    // 传统白名单（向后兼容）
    mapping(address => bool) internal _whitelist;

    // 事件
    event InvestorWhitelisted(address indexed investor);
    event InvestorRemoved(address indexed investor);

    // 声明 onlyOwner 修饰符由上层合约提供（Ownable）

    /**
     * @dev 将地址添加到白名单。只能由拥有者调用。
     * @param investor 要列入白名单的投资者地址。
     */
    function addInvestor(address investor) public virtual onlyOwner {
        require(investor != address(0), unicode"DebtToken: 不能将零地址列入白名单");
        _whitelist[investor] = true;
        emit InvestorWhitelisted(investor);
    }

    /**
     * @dev 将地址从白名单中移除。只能由拥有者调用。
     * @param investor 要从白名单中移除的投资者地址。
     */
    function removeInvestor(address investor) public virtual onlyOwner {
        _whitelist[investor] = false;
        emit InvestorRemoved(investor);
    }

    /**
     * @dev 检查地址是否在白名单中。
     * @param investor 要检查的地址。
     * @return bool 如果地址在白名单中，则返回true，否则返回false。
     */
    function isWhitelisted(address investor) public view virtual returns (bool) {
        return _whitelist[investor];
    }
}
