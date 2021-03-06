import {
  connectToDBAwaiting,
  connectToDBProposals,
} from "helpers/database/mongo"; // Mongo connection

/**
 * Inserts delegate tx to the database
 * @param {Object} tx dictionary containing the signature data
 */
const insertDelegateTx = async (tx) => {
  // Collect database connection
  const db = await connectToDBAwaiting();

  // Insert delegate transaction
  const { insertedId } = await db.insertOne(tx);

  // Return insertionId
  return insertedId;
};

/**
 * Does database data validation for delegation. Checks
 * if user has pending tx or tx in past week.
 * @param {String} address
 */
const delegationAllowed = async (address) => {
  // Collect database connection
  const db = await connectToDBAwaiting();

  // Check for existing transactions from user
  const existingUserTxs = await db
    .find({ from: address, type: "delegate", executed: false })
    .toArray();

  // If existing transactions, throw error
  if (existingUserTxs.length > 0) {
    const error = new Error(
      "user has pending delegate txs. Please wait before queueing more"
    );
    error.code = 403;
    throw error;
  }

  // Check for delegations in past week
  const delegationsInPastWeek = await db
    .find({
      createdAt: {
        $gte: new Date(new Date() - 7 * 60 * 60 * 24 * 1000),
      },
      from: address,
      type: "delegate",
    })
    .toArray();

  // If delegations in past week, throw error
  if (delegationsInPastWeek.length > 0) {
    const error = new Error("only one delegation allowed per week");
    error.code = 403;
    throw error;
  }
};

/**
 * Inserts vote tx to the database
 * @param {Object} tx dictionary containing the signature data
 * @returns {String} insertedId Id of the inserted tx
 */
const insertVoteTx = async (tx) => {
  // Collect database connection
  const db = await connectToDBAwaiting();

  // Insert vote
  const { insertedId } = await db.insertOne(tx);

  // Return inserted vote id
  return insertedId;
};

/**
 * Validates vote tx based on database data. Checks if user
 * has already submitted a sig for this proposal.
 * @param {String} address
 * @param {Number} proposalId
 */
const voteAllowed = async (address, proposalId) => {
  // Collect database connection
  const db = await connectToDBAwaiting();

  // Collect existing user transactions
  const existingUserTxs = await db
    .find({ from: address, proposalId: proposalId, type: "vote" })
    .toArray();

  // If existing transactions, throw error
  if (existingUserTxs.length > 0) {
    const error = new Error("user already voted for this proposal");
    error.code = 409;
    throw error;
  }
};

const pendingTransactions = async () => {
  // Collect database connection
  const db = await connectToDBAwaiting();

  const pendingTxs = await db.find({ executed: false }).toArray();
  pendingTxs.forEach((tx) => {
    delete tx._id;
    delete tx.executed;
    delete tx.createdAt;
  });
  return pendingTxs;
};

/**
 * Function to produce Mongodb pointer
 * @param {*} last Last value (inclusive)
 * @param {*} pageSize (page size)
 * @returns 
 */
const fetchProposals = async (last, pageSize) => {
  const db = await connectToDBProposals();
  const proposals = db.find({id:{$lte:last}}).sort({"id":-1}).limit(pageSize);
  return proposals;
}

const fetchCachedProposalsCount = async () => {
  const db = await connectToDBProposals();
  return await db.find().count();
}

const addProposals = async (proposals) => {
  const collection = await connectToDBProposals();
  await collection.insertMany(proposals);
}

// Export functions
export {
  insertDelegateTx,
  insertVoteTx,
  delegationAllowed,
  voteAllowed,
  pendingTransactions,
  fetchProposals,
  addProposals,
  fetchCachedProposalsCount
};
