import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token');

  // If already authenticated, redirect directly to cashier
  if (token?.value === 'authenticated') {
    redirect('/cashier');
  }

  // Otherwise, redirect to login page
  redirect('/login');
}