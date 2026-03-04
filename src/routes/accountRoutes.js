const router = require("express").Router();
const {
  createAccount,
  getAccounts,
  getAccount,
  updateAccount,
  deleteAccount
} = require("../controllers/accountController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.route("/")
  .post(createAccount)
  .get(getAccounts);

router.route("/:id")
  .get(getAccount)
  .put(updateAccount)
  .delete(deleteAccount);

module.exports = router;