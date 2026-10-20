import './global.css';

export const metadata = {
  title: 'Booktend',
  description: 'Workshop booking system',
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  // Browser extensions (quick-view overlays, screenshot tools) add attributes to
  // <html> and <body> before React hydrates, which React reports as a mismatch.
  // Suppressing the warning on just these two elements keeps the console clean
  // while real markup mismatches deeper in the tree still report normally.
  return (
    <html lang="en" suppressHydrationWarning>
      {/* `font-sans` is intentionally omitted: the app stylesheets own the type stack. */}
      <body className="min-h-screen bg-background antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
