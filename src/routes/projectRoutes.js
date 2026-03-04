const router = require("express").Router();
const {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  getProjectCompleteStats,
  getProjectCompleteSummary,  // NEW
  exportProjectToExcel
} = require("../controllers/projectController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// Basic CRUD routes
router.route("/")
  .post(createProject)
  .get(getProjects);

// New complete summary route
router.get("/:id/complete-summary", getProjectCompleteSummary);

// Existing stats and export routes
router.get("/:id/complete-stats", getProjectCompleteStats);
router.get("/:id/export-excel", exportProjectToExcel);

router.route("/:id")
  .get(getProject)
  .put(updateProject)
  .delete(deleteProject);

module.exports = router;