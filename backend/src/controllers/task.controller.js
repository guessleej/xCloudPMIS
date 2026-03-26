// task.controller stub
const taskController = {
  createTask: async (data) => ({ id: 1, ...data }),
  updateTask: async (id, data) => ({ id, ...data }),
  deleteTask: async (id) => ({ id }),
};
module.exports = { taskController };
