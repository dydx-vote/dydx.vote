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
    "https://api.thegraph.com/subgraphs/name/arr00/dydx-governance",
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

  const tallyRes = await axios.post(
    "https://identity.withtally.com/user/profiles/by/address",
    {
      addresses: accounts.map((x) => x.id),
    }
  );

  const tallyAccountsData = tallyRes.data.data.usersByAddress;

  // Combine maps recieved from thegraph and tally
  for (const x in accounts) {
    let a = accounts[x];
    a.address = a.id;
    a.proposals_voted = a.numberVotes;
    a.proposing_power = a.proposingPower;
    a.voting_power = a.votingPower;
    delete a.numberVotes;
    delete a.id;
    delete a.votingPower;
    delete a.proposingPower;

    let b = {};
    if (tallyAccountsData[accounts[x].address.toLowerCase()]) {
      b = tallyAccountsData[accounts[x].address.toLowerCase()];
      b.display_name = b.displayName;
      b.image_url = b.avatarUrl;
      delete b.avatarUrl;
      delete b.tallyId;
      delete b.addresses;
      delete b.displayName;
    }

    accounts[x] = Object.assign({}, a, b);
    accounts[x]["rank"] = Number(x) + offset + 1;
  }

  let resData = { accounts, pagination_summary };
  res.json(resData);
};
