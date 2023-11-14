import axios from "axios"; // Axios requests

export default async (req, res) => {
  // pagination logic
  let { page_number = 1, page_size = 10 } = req.query;
  page_number = Number(page_number);
  page_size = Number(page_size);
  const offset = (page_number - 1) * page_size;
  const total_pages = Math.ceil(2000 / page_size);
  let pagination_summary = { total_pages, page_size, page_number };
  if (
    pagination_summary.page_number < 1 ||
    pagination_summary.page_number > pagination_summary.total_pages
  ) {
    res.status(400).send("Invalid page number");
    return;
  }

  // Fetch top delegates from thegraph
  const graphRes = await axios.post(
    "https://api.thegraph.com/subgraphs/name/graph-buildersdao/dydx-governance",
    {
      query:
        `{
					users(first:` +
        page_size +
        `, orderBy:votingPower, where:{numberVotes_gte:1}, orderDirection:desc, skip:` +
        offset +
        `) {
						id
						numberVotes
            votingPower
            proposingPower
					}
				}`,
    }
  );
  const accounts = graphRes.data.data.users;

  let accountDataRequests = [];
  for (const account of accounts) {
    accountDataRequests.push(
      axios.post(
        "https://api.tally.xyz/query",
        {
          query: `query AddressHeader($address: Address!) {
              address(address: $address) {
                accounts {
                  name
                  picture
                  identities {
                    twitter
                  }
                }
              }
            }`,
          variables: {
            address: account.id,
          },
        },
        {
          headers: {
            "Api-Key": process.env.TALLY_API_KEY,
          },
        }
      )
    );
  }

  const accountDataRequestResults = await Promise.all(accountDataRequests);
  const accountData = accountDataRequestResults.map(
    (x) => x.data.data.address.accounts[0]
  );

  for (const x in accounts) {
    let a = accounts[x];
    a.address = a.id;
    a.proposals_voted = a.numberVotes;
    a.proposing_power = a.proposingPower;
    a.voting_power = a.votingPower;
    a.display_name =
      accountData[x].name.substring(0, 2) != "0x" ? accountData[x].name : null;
    a.twitter = accountData[x].identities.twitter;
    a.image_url = accountData[x].picture;

    delete a.numberVotes;
    delete a.id;
    delete a.votingPower;
    delete a.proposingPower;

    accounts[x] = a;
    accounts[x]["rank"] = Number(x) + offset + 1;
  }

  let resData = { accounts, pagination_summary };
  res.json(resData);
};
