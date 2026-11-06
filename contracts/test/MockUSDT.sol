// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Local test fixture only. Never deployed by the Whitechain deployment script.
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
contract MockUSDT is ERC20, EIP712 {
    mapping(address => mapping(bytes32 => bool)) public used;
    bytes32 constant RECEIVE_TYPEHASH = keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    constructor() ERC20("Tether USD", "USDT") EIP712("Tether USD", "1") {}
    function decimals() public pure override returns(uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to,amount); }
    function receiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) external {
        require(msg.sender == to, "payee only");
        require(block.timestamp > validAfter && block.timestamp < validBefore, "expired authorization");
        require(!used[from][nonce], "used authorization");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(RECEIVE_TYPEHASH,from,to,value,validAfter,validBefore,nonce)));
        require(ECDSA.recover(digest,v,r,s) == from, "invalid authorization");
        used[from][nonce] = true;
        _transfer(from,to,value);
    }
}
