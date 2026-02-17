// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDePINOracle {
    struct WeatherData {
        uint256 stationId;
        int256 temperature;
        uint256 humidity;
        uint256 windSpeed;
        uint256 rainfall;
        uint256 timestamp;
        bytes32 dataHash;
        bool signatureVerified;
        address recoveredSigner;
    }

    function getLatestData(uint256 stationId) external view returns (WeatherData memory);
    function isDataAuthentic(uint256 stationId) external view returns (bool);
    function stationAddresses(uint256 stationId) external view returns (address);
}
