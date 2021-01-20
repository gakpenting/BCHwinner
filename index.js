const axios = require('axios');
const csv = require('csv-parser');
const fs = require('fs');
const slpdbUri = 'https://slpdb.fountainhead.cash/q/';
const btoa = function (str) {
  return Buffer.from(str).toString('base64');
};
var parse = require('csv-parse');
const csvPromise = new Promise((resolve, reject) => {
  fs.readFile('./projects.csv', (err, fileData) => {
    parse(fileData, {}, function(err, rows) {
      
      resolve(rows) ;
    });
  });
})
async function slpList(){
    const records = await csvPromise
    records.shift()
return records.map(a=>({project_name:a[0],slp_address:a[1],explorer:`https://explorer.bitcoin.com/bch/address/${a[1]}`}))
    
}


async function querySlpDB(q) {
  const b64 = btoa(JSON.stringify(q));
  const url = slpdbUri + b64;
  const options = {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
    },
    url,
  };
  const result = await axios(options);
  return result.data ? result.data : null;
}

function buildQuery(slp) {
  return {
    v: 3,
    q: {
      db: ['g'],
      aggregate: [
        {
          $match: {
            'graphTxn.outputs.address': slp,
            'tokenDetails.tokenIdHex':
              '78632119b0cfe861df5441dd6b3486afc99ce1dd1114b84018a6f3ae9508923f',
          },
        },
        {
          $unwind: '$graphTxn.outputs',
        },
        {
          $match: {
            'graphTxn.outputs.address': slp,
            'graphTxn.outputs.status': 'UNSPENT',
          },
        },
        {
          $group: {
            _id: '$graphTxn.outputs.address',
            slpAmount: {
              $sum: '$graphTxn.outputs.slpAmount',
            },
          },
        },
        {
          $match: {
            slpAmount: {
              $gt: 0,
            },
          },
        },
      ],
      sort: {
        slpAmount: -1,
      },
      project: {
        address: '$_id',
        token_balance: '$slpAmount',
      },
      limit: 10,
      skip: 0,
    },
  };
}

async function getTeamScores(slpList) {
  try {
    const scores = await Promise.all(
      slpList.map(async (slp) => {
        const query = buildQuery(slp.slp_address);
        const result = await querySlpDB(query);
        if (result && result.g && result.g[0]) {
          return {
              project_name:slp.project_name,
              explorer:slp.explorer,
            address: result.g[0].address,
            tokens: parseInt(result.g[0].token_balance, 10),
          };
        }
      })
    );
    return scores
      .filter((n) => n)
      .sort((a, b) => (a.tokens > b.tokens ? -1 : 1));
  } catch (error) {
    console.error('error in getTeamScores(): ', error);
  }
}

const allScores = async (slpList) => {
  const result = await getTeamScores(await slpList());
  const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csvWriter = createCsvWriter({
  path: 'winner.csv',
  header: [
    {id: 'project_name', title: 'Project Name'},
    {id: 'address', title: 'SLP Address'},
    {id: 'tokens', title: 'Balance'},
    {id: 'explorer', title: 'Explorer'},
  ]
});
await csvWriter
  .writeRecords(result)
};

allScores(slpList);