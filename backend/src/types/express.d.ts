declare global {
  namespace Express {
    interface Request {
      adminUser?: import("../lib/adminAuthToken.js").AuthenticatedAdmin;
      studentUser?: import("../lib/studentAuthToken.js").AuthenticatedStudent;
    }
  }
}

export {};
