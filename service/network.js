// @ts-check
const validNetworks = ['mainnet', 'regtest', 'testnet'];

const defaultNetwork = 'testnet';

const selected = process.env.OCW_NETWORK || defaultNetwork;

if (!validNetworks.includes(selected)) {
  throw new Error(`UnknownNetwork:${selected}`);
}

module.exports = selected;
