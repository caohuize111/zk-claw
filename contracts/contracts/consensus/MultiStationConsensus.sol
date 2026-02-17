// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../DePINOracle.sol";

/// @title MultiStationConsensus - M-of-N multi-station consensus for DePIN weather data
/// @notice Aggregates weather data from multiple stations and checks if enough stations
///         agree within a tolerance to reach consensus.
contract MultiStationConsensus {

    struct ConsensusGroup {
        uint256[] stationIds;
        uint256 threshold;
        uint256 toleranceBps;
        bool active;
    }

    struct ConsensusResult {
        int256 avgTemperature;
        uint256 avgHumidity;
        uint256 avgWindSpeed;
        uint256 avgRainfall;
        uint256 agreeingStations;
        bool reached;
        uint256 timestamp;
    }

    // Internal struct to pack station data and reduce stack depth
    struct StationReadings {
        int256[] temps;
        uint256[] humids;
        uint256[] winds;
        uint256[] rains;
    }

    struct Averages {
        int256 avgTemp;
        uint256 avgHumid;
        uint256 avgWind;
        uint256 avgRain;
    }

    DePINOracle public oracle;
    address public admin;

    mapping(uint256 => ConsensusGroup) public groups;
    uint256 public nextGroupId;

    mapping(uint256 => ConsensusResult) public results;

    event GroupCreated(uint256 indexed groupId, uint256 stationCount, uint256 threshold);
    event ConsensusReached(uint256 indexed groupId, bool reached, uint256 agreeingStations);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(address _oracle) {
        oracle = DePINOracle(_oracle);
        admin = msg.sender;
    }

    /// @notice Create a consensus group from a set of station IDs
    function createGroup(
        uint256[] calldata stationIds,
        uint256 threshold,
        uint256 toleranceBps
    ) external onlyAdmin returns (uint256 groupId) {
        require(threshold > 0, "Threshold must be > 0");
        require(threshold <= stationIds.length, "Threshold exceeds station count");

        groupId = nextGroupId++;
        ConsensusGroup storage g = groups[groupId];
        g.stationIds = stationIds;
        g.threshold = threshold;
        g.toleranceBps = toleranceBps;
        g.active = true;

        emit GroupCreated(groupId, stationIds.length, threshold);
    }

    /// @notice Check consensus across all stations in a group
    function checkConsensus(uint256 groupId) external returns (ConsensusResult memory) {
        ConsensusGroup storage g = groups[groupId];
        require(g.active, "Group not active");

        uint256 n = g.stationIds.length;
        StationReadings memory readings = _readStations(g.stationIds, n);
        Averages memory avg = _computeAverages(readings, n);
        uint256 agreeing = _countAgreeing(readings, avg, g.toleranceBps, n);
        bool reached = agreeing >= g.threshold;

        ConsensusResult memory result = ConsensusResult({
            avgTemperature: avg.avgTemp,
            avgHumidity: avg.avgHumid,
            avgWindSpeed: avg.avgWind,
            avgRainfall: avg.avgRain,
            agreeingStations: agreeing,
            reached: reached,
            timestamp: block.timestamp
        });

        results[groupId] = result;
        emit ConsensusReached(groupId, reached, agreeing);
        return result;
    }

    function getResult(uint256 groupId) external view returns (ConsensusResult memory) {
        return results[groupId];
    }

    function getGroupStationIds(uint256 groupId) external view returns (uint256[] memory) {
        return groups[groupId].stationIds;
    }

    // --- Internal helpers (split to avoid stack-too-deep) ---

    function _readStations(uint256[] storage stationIds, uint256 n) internal view returns (StationReadings memory readings) {
        readings.temps = new int256[](n);
        readings.humids = new uint256[](n);
        readings.winds = new uint256[](n);
        readings.rains = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            DePINOracle.WeatherData memory d = oracle.getLatestData(stationIds[i]);
            readings.temps[i] = d.temperature;
            readings.humids[i] = d.humidity;
            readings.winds[i] = d.windSpeed;
            readings.rains[i] = d.rainfall;
        }
    }

    function _computeAverages(StationReadings memory r, uint256 n) internal pure returns (Averages memory avg) {
        int256 sumTemp;
        uint256 sumHumid;
        uint256 sumWind;
        uint256 sumRain;
        for (uint256 i = 0; i < n; i++) {
            sumTemp += r.temps[i];
            sumHumid += r.humids[i];
            sumWind += r.winds[i];
            sumRain += r.rains[i];
        }
        avg.avgTemp = sumTemp / int256(n);
        avg.avgHumid = sumHumid / n;
        avg.avgWind = sumWind / n;
        avg.avgRain = sumRain / n;
    }

    function _countAgreeing(StationReadings memory r, Averages memory avg, uint256 toleranceBps, uint256 n) internal pure returns (uint256 agreeing) {
        for (uint256 i = 0; i < n; i++) {
            if (_withinToleranceSigned(r.temps[i], avg.avgTemp, toleranceBps) &&
                _withinTolerance(r.humids[i], avg.avgHumid, toleranceBps) &&
                _withinTolerance(r.winds[i], avg.avgWind, toleranceBps) &&
                _withinTolerance(r.rains[i], avg.avgRain, toleranceBps))
            {
                agreeing++;
            }
        }
    }

    function _withinTolerance(uint256 a, uint256 b, uint256 toleranceBps) internal pure returns (bool) {
        if (b == 0) return a == 0;
        uint256 diff = a > b ? a - b : b - a;
        return diff * 10000 <= b * toleranceBps;
    }

    function _withinToleranceSigned(int256 a, int256 b, uint256 toleranceBps) internal pure returns (bool) {
        if (b == 0) return a == 0 || (a > 0 ? uint256(a) : uint256(-a)) * 10000 <= toleranceBps;
        int256 diff = a > b ? a - b : b - a;
        uint256 absDiff = diff >= 0 ? uint256(diff) : uint256(-diff);
        uint256 absB = b >= 0 ? uint256(b) : uint256(-b);
        return absDiff * 10000 <= absB * toleranceBps;
    }
}
