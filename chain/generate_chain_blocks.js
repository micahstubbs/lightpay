const asyncAuto = require('async/auto');
const asyncMapSeries = require('async/mapSeries');
const asyncTimesSeries = require('async/timesSeries');

const chainRpc = require('./chain_rpc');
const getBlockDetails = require('./get_block_details');
const {returnResult} = require('./../async-util');

const {generateToAddress} = require('./conf/rpc_commands');

const noDelay = 0;
const blocksPerCall = 1;

/** Generate blocks on the chain (Bitcoin Core regtest)

  {
    [blocks_count]: <Number of Blocks to Generate Number>
    [delay]: <Delay Between Blocks Ms> = 0
    mining_address: <Address to Mine To String>
    network: <Network Name String>
  }

  @returns via cbk
  {
    blocks: [{
      transactions: [{
        id: <Transaction Id Hex String>
        outputs: [{
          tokens: <Tokens Send Number>
        }]
      }]
    }]
  }
*/
module.exports = (args, cbk) => {
  if (!args.mining_address) {
    return cbk([400, 'ExpectedMiningAddress']);
  }

  return asyncAuto({
    generateBlocks: cbk => {
      return asyncTimesSeries(args.blocks_count, (_, cbk) => {
        return chainRpc({
          cmd: generateToAddress,
          network: args.network,
          params: [blocksPerCall, args.mining_address],
        },
        (err, blockHashes) => {
          if (!!err) {
            return cbk(err);
          }

          const [blockHash] = blockHashes;

          return setTimeout(() => cbk(null, blockHash), args.delay || noDelay);
        });
      },
      cbk);
    },

    blocks: ['generateBlocks', ({generateBlocks}, cbk) => {
      return asyncMapSeries(generateBlocks, (blockHash, cbk) => {
        return getBlockDetails({
          block_hash: blockHash,
          network: args.network,
        },
        cbk);
      },
      cbk);
    }],

    blockDetails: ['blocks', ({blocks}, cbk) => cbk(null, {blocks})],
  },
  returnResult({of: 'blockDetails'}, cbk));
};
