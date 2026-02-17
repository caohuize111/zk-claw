export const GATEWAY_ABI = [
  {
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInstances", type: "uint256[]" },
      { name: "agentId", type: "uint256" },
      { name: "stationId", type: "uint256" },
    ],
    name: "submitVerifiedInference",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "proofHash", type: "bytes32" },
      { name: "publicInstances", type: "uint256[]" },
      { name: "agentId", type: "uint256" },
      { name: "stationId", type: "uint256" },
      { name: "decision", type: "uint8" },
    ],
    name: "submitOffchainVerified",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "index", type: "uint256" }],
    name: "getRecord",
    outputs: [
      {
        components: [
          { name: "agentId", type: "uint256" },
          { name: "proofHash", type: "bytes32" },
          { name: "inputHash", type: "bytes32" },
          { name: "publicInstances", type: "uint256[]" },
          { name: "timestamp", type: "uint256" },
          { name: "verified", type: "bool" },
          { name: "decision", type: "uint8" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentRecordCount",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentScore",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalVerifications",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalClaimsTriggered",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalRecords",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const NFA_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "name", type: "string" },
          { name: "persona", type: "string" },
          { name: "vaultURI", type: "string" },
          { name: "vaultHash", type: "bytes32" },
        ],
        type: "tuple",
      },
    ],
    name: "mint",
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getProfile",
    outputs: [
      {
        components: [
          { name: "totalPredictions", type: "uint256" },
          { name: "correctPredictions", type: "uint256" },
          { name: "learningRoot", type: "bytes32" },
          { name: "reputationScore", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getMetadata",
    outputs: [
      {
        components: [
          { name: "name", type: "string" },
          { name: "persona", type: "string" },
          { name: "vaultURI", type: "string" },
          { name: "vaultHash", type: "bytes32" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalAgents",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const DEPIN_ORACLE_ABI = [
  {
    inputs: [{ name: "stationId", type: "uint256" }],
    name: "getLatestData",
    outputs: [
      {
        components: [
          { name: "stationId", type: "uint256" },
          { name: "temperature", type: "int256" },
          { name: "humidity", type: "uint256" },
          { name: "windSpeed", type: "uint256" },
          { name: "rainfall", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "dataHash", type: "bytes32" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "stationId", type: "uint256" },
      { name: "temperature", type: "int256" },
      { name: "humidity", type: "uint256" },
      { name: "windSpeed", type: "uint256" },
      { name: "rainfall", type: "uint256" },
    ],
    name: "submitWeatherData",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getStationCount",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
