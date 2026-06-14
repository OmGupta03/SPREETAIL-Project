import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata = {
  title: "Splitwise Clone | Settle Debts & Track Expenses",
  description: "A simplified, modern Splitwise clone that tracks group expenses, balances, settlements, and lets members chat in real-time.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
