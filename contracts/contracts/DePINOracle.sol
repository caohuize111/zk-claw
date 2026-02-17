// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title DePINOracle - DePIN Weather Station with Hardware Signature Verification
/// @notice TEE-attested hardware sensors: each station has a bound public key,
///         and all submitted data must be signed by that key (ecrecover verification).
/// @dev In production, the private key lives in the sensor's Secure Element / TEE.
contract DePINOracle {
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
    mapping(uint256 => uint256) public stationNonces;     // replay protection
    uint256[] public stationIds;
    address public admin;
    address public pendingAdmin;

    event StationRegistered(uint256 indexed stationId, address indexed stationAddress);
    event WeatherDataSubmitted(
        uint256 indexed stationId,
        bytes32 dataHash,
        uint256 timestamp,
        bool signatureVerified
    );
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Register a weather station with its hardware public key (admin only)
    /// @param stationId Unique station identifier
    /// @param stationAddress The public key / address bound to this station's TEE
    function registerStation(uint256 stationId, address stationAddress) external onlyAdmin {
        require(!registeredStations[stationId], "Station already registered");
        require(stationAddress != address(0), "Invalid station address");
        registeredStations[stationId] = true;
        stationAddresses[stationId] = stationAddress;
        stationIds.push(stationId);
        emit StationRegistered(stationId, stationAddress);
    }

    /// @notice Initiate two-step admin transfer by setting pending admin
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin address");
        pendingAdmin = newAdmin;
    }

    /// @notice Accept admin role (must be called by pending admin)
    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not pending admin");
        emit AdminTransferred(admin, pendingAdmin);
        admin = pendingAdmin;
        pendingAdmin = address(0);
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

        // Compute deterministic data hash from sensor readings (includes nonce for replay protection)
        bytes32 dataHash = keccak256(abi.encodePacked(
            stationId, temperature, humidity, windSpeed, rainfall, stationNonces[stationId]
        ));

        // Verify hardware signature via ecrecover BEFORE modifying state
        bytes32 ethSignedHash = dataHash.toEthSignedMessageHash();
        address recovered = ECDSA.recover(ethSignedHash, signature);
        require(recovered == stationAddresses[stationId], "Invalid hardware signature");

        // Only increment nonce after signature verification passes (prevents DoS via nonce poisoning)
        stationNonces[stationId]++;

        latestData[stationId] = WeatherData({
            stationId: stationId,
            temperature: temperature,
            humidity: humidity,
            windSpeed: windSpeed,
            rainfall: rainfall,
            timestamp: block.timestamp,
            dataHash: dataHash,
            signatureVerified: true,
            recoveredSigner: recovered
        });

        emit WeatherDataSubmitted(stationId, dataHash, block.timestamp, true);
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
