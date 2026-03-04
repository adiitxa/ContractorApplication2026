const router = require("express").Router();
const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory
} = require("../controllers/categoryController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.route("/")
  .post(createCategory)
  .get(getCategories);

router.route("/:id")
  .put(updateCategory)
  .delete(deleteCategory);

module.exports = router;