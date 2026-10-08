import { AuthToast } from "@/app/auth/auth-toast";

type AuthMessageProps = {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
};

export async function AuthMessage({ searchParams }: AuthMessageProps) {
  const params = await searchParams;

  return <AuthToast error={params?.error} success={params?.success} />;
}
