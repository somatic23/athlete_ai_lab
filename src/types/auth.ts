import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    onboardingCompleted?: boolean;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role?: string;
      onboardingCompleted?: boolean;
    };
  }
  interface JWT {
    role?: string;
    onboardingCompleted?: boolean;
  }
}
