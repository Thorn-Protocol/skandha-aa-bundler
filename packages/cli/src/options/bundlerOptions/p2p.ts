// eslint-disable-next-line import/no-extraneous-dependencies
import { defaultOptions, IBundlerNodeOptions } from "node/lib/options/bundler";
import { ICliCommandOptions } from "../../util";

const defaultListenAddress = "0.0.0.0";
export const defaultP2pPort = 4337;

export interface INetworkArgs {
  discv5?: boolean;
  listenAddress?: string;
  port?: number;
  discoveryPort?: number;
  bootnodes?: string[];
  targetPeers: number;
  subscribeAllSubnets: boolean;
  mdns: boolean;
  "network.maxPeers": number;
  "network.connectToDiscv5Bootnodes": boolean;
  "network.discv5FirstQueryDelayMs": number;
  "network.dontSendGossipAttestationsToForkchoice": boolean;
  "network.allowPublishToZeroPeers": boolean;
  "network.gossipsubD": number;
  "network.gossipsubDLow": number;
  "network.gossipsubDHigh": number;
  "network.gossipsubAwaitHandler": boolean;
  "network.rateLimitMultiplier": number;
}

export function parseArgs(args: INetworkArgs): IBundlerNodeOptions["network"] {
  const listenAddress = args.listenAddress || defaultListenAddress;
  const udpPort = args.discoveryPort ?? args.port ?? defaultP2pPort;
  const tcpPort = args.port ?? defaultP2pPort;

  return {
    discv5: {
      enabled: args["discv5"] ?? true,
      bindAddr: `/ip4/${listenAddress}/udp/${udpPort}`,
      // TODO: Okay to set to empty array?
      bootEnrs: args["bootnodes"] ?? [],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      enr: undefined as any,
    },
    maxPeers:
      args["network.maxPeers"] ??
      (args["targetPeers"] !== undefined
        ? args["targetPeers"] * 1.1
        : undefined),
    targetPeers: args["targetPeers"],
    localMultiaddrs: [`/ip4/${listenAddress}/tcp/${tcpPort}`],
    subscribeAllSubnets: args["subscribeAllSubnets"],
    connectToDiscv5Bootnodes: args["network.connectToDiscv5Bootnodes"],
    discv5FirstQueryDelayMs: args["network.discv5FirstQueryDelayMs"],
    // dontSendGossipAttestationsToForkchoice:
    //   args["network.dontSendGossipAttestationsToForkchoice"],
    // allowPublishToZeroPeers: args["network.allowPublishToZeroPeers"],
    // gossipsubD: args["network.gossipsubD"],
    // gossipsubDLow: args["network.gossipsubDLow"],
    // gossipsubDHigh: args["network.gossipsubDHigh"],
    // gossipsubAwaitHandler: args["network.gossipsubAwaitHandler"],
    mdns: args["mdns"],
    // rateLimitMultiplier: args["network.rateLimitMultiplier"],
  };
}

export const options: ICliCommandOptions<INetworkArgs> = {
  discv5: {
    type: "boolean",
    // TODO: Add `network.discv5.enabled` to the `IDiscv5DiscoveryInputOptions` type
    description: "Enable discv5",
    defaultDescription: String(true),
    group: "network",
  },

  listenAddress: {
    type: "string",
    description: "The address to listen for p2p UDP and TCP connections",
    defaultDescription: defaultListenAddress,
    group: "network",
  },

  port: {
    description:
      "The TCP/UDP port to listen on. The UDP port can be modified by the --discovery-port flag.",
    type: "number",
    defaultDescription: String(defaultP2pPort),
    group: "network",
  },

  discoveryPort: {
    description:
      "The UDP port that discovery will listen on. Defaults to `port`",
    type: "number",
    defaultDescription: "`port`",
    group: "network",
  },

  bootnodes: {
    type: "array",
    description: "Bootnodes for discv5 discovery",
    defaultDescription: JSON.stringify(
      (defaultOptions.network.discv5 || {}).bootEnrs || []
    ),
    group: "network",
    // Each bootnode entry could be comma separated, just deserialize it into a single array
    // as comma separated entries are generally most friendly in ansible kind of setups, i.e.
    // [ "en1", "en2,en3" ] => [ 'en1', 'en2', 'en3' ]
    coerce: (args: string[]) => args.map((item) => item.split(",")).flat(1),
  },

  targetPeers: {
    type: "number",
    description:
      "The target connected peers. Above this number peers will be disconnected",
    defaultDescription: String(defaultOptions.network.targetPeers),
    group: "network",
  },

  subscribeAllSubnets: {
    type: "boolean",
    description: "Subscribe to all subnets regardless of validator count",
    defaultDescription: String(
      defaultOptions.network.subscribeAllSubnets === true
    ),
    group: "network",
  },

  mdns: {
    type: "boolean",
    description: "Enable mdns local peer discovery",
    defaultDescription: String(defaultOptions.network.mdns === true),
    group: "network",
  },

  "network.maxPeers": {
    hidden: true,
    type: "number",
    description: "The maximum number of connections allowed",
    defaultDescription: String(defaultOptions.network.maxPeers),
    group: "network",
  },

  "network.connectToDiscv5Bootnodes": {
    type: "boolean",
    description:
      "Attempt direct connection to discv5 bootnodes from network.discv5.bootEnrs option",
    hidden: true,
    defaultDescription: String(
      defaultOptions.network.connectToDiscv5Bootnodes === true
    ),
    group: "network",
  },

  "network.discv5FirstQueryDelayMs": {
    type: "number",
    description:
      "Delay the 1st heart beat of Peer Manager after starting Discv5",
    hidden: true,
    defaultDescription: String(defaultOptions.network.discv5FirstQueryDelayMs),
    group: "network",
  },

  "network.dontSendGossipAttestationsToForkchoice": {
    hidden: true,
    type: "boolean",
    description: "Pass gossip attestations to forkchoice or not",
    group: "network",
  },

  "network.allowPublishToZeroPeers": {
    hidden: true,
    type: "boolean",
    description: "Don't error when publishing to zero peers",
    group: "network",
  },

  "network.gossipsubD": {
    hidden: true,
    type: "number",
    description: "Gossipsub D param",
    group: "network",
  },

  "network.gossipsubDLow": {
    hidden: true,
    type: "number",
    description: "Gossipsub D param low",
    group: "network",
  },

  "network.gossipsubDHigh": {
    hidden: true,
    type: "number",
    description: "Gossipsub D param high",
    group: "network",
  },

  "network.gossipsubAwaitHandler": {
    hidden: true,
    type: "boolean",
    group: "network",
  },

  "network.rateLimitMultiplier": {
    type: "number",
    description:
      "The multiplier to increase the rate limits. Set to zero to disable rate limiting.",
    hidden: true,
    defaultDescription: String("defaultOptions.network.rateLimitMultiplier"),
    group: "network",
  },
};