// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title MockDePINOracle - DePIN Weather Station with Hardware Signature Verification
/// @notice Simulates TEE-attested hardware sensors: each station has a bound public key,
///         and all submitted data must be signed by that key (ecrecover verification).
/// @dev In production, the private key lives in the sensor's Secure Element / TEE.
///      Here we simulate with EOA keys -- the verification logic is identical.
contract MockDePINOracle {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct WeatherData {
        uint256 stationId;
        int256 temperature;         // Celsius * 100 (e.g., -800 = -8.00C)
        uint256 humidity;           // Percentage * 100
        uint256 windSpeed;          // km/h * 100
        uint256 rainfall;           // mm * 100
        uint256 timestamp;
        bytes32 dataHash;           // keccak256 of raw sensor readings
        bool signatureVerified;     // true if ecrecover matched station key
        address recoveredSigner;    // the address recovered from signature
    }

    mapping(uint256 => WeatherData) public latestData;
    mapping(uint256 => bool) public registeredStations;
    mapping(uint256 => address) public stationAddresses;  // stationId => hardware public key
    uint256[] public stationIds;

    event StationRegistered(uint256 indexed stationId, address indexed stationAddress);
    event WeatherDataSubmitted(
        uint256 indexed stationId,
        bytes32 dataHash,
        uint256 timestamp,
        bool signatureVerified
    );

    /// @notice Register a weather station with its hardware public key
    /// @param stationId Unique station identifier
    /// @param stationAddress The public key / address bound to this station's TEE
    function registerStation(uint256 stationId, address stationAddress) external {
        require(!registeredStations[stationId], "Station already registered");
        require(stationAddress != address(0), "Invalid station address");
        registeredStations[stationId] = true;
        stationAddresses[stationId] = stationAddress;
        stationIds.push(stationId);
        emit StationRegistered(stationId, stationAddress);
    }

    /// @notice Submit weather data with hardware signature verification
    /// @param stationId The station submitting data
    /// @param temperature Celsius * 100
    /// @param humidity Percentage * 100
    /// @param windSpeed km/h * 100
    /// @param rainfall mm * 100
    /// @param signature ECDSA signature from the station's hardware key over the data hash
    function submitWeatherData(
        uint256 stationId,
        int256 temperature,
        uint256 humidity,
        uint256 windSpeed,
        uint256 rainfall,
        bytes memory signature
    ) external {
        require(registeredStations[stationId], "Station not registered");

        // Compute deterministic data hash from sensor readings
        bytes32 dataHash = keccak256(abi.encodePacked(
            stationId, temperature, humidity, windSpeed, rainfall
        ));

        // Verify hardware signature via ecrecover
        bytes32 ethSignedHash = dataHash.toEthSignedMessageHash();
        address recovered = ECDSA.recover(ethSignedHash, signature);
        bool sigValid = (recovered == stationAddresses[stationId]);

        latestData[stationId] = WeatherData({
            stationId: stationId,
            temperature: temperature,
            humidity: humidity,
            windSpeed: windSpeed,
            rainfall: rainfall,
            timestamp: block.timestamp,
            dataHash: dataHash,
            signatureVerified: sigValid,
            recoveredSigner: recovered
        });

        emit WeatherDataSubmitted(stationId, dataHash, block.timestamp, sigValid);
    }

    /// @notice Check if a station's latest data has verified hardware signature
    function isDataAuthentic(uint256 stationId) external view returns (bool) {
        return latestData[stationId].signatureVerified;
    }

    function getLatestData(uint256 stationId) external view returns (WeatherData memory) {
        require(registeredStations[stationId], "Station not registered");
        return latestData[stationId];
    }

    function getStationCount() external view returns (uint256) {
        return stationIds.length;
    }

    function verifyDataHash(uint256 stationId, bytes32 expectedHash) external view returns (bool) {
        return latestData[stationId].dataHash == expectedHash;
    }
}
