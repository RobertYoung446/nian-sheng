import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://nian-sheng.openai.site'),
  title: '念生｜让值得实现的想法，真正发生',
  description: '记录灵感、分析可行性、发现想法关系，并把值得做的方向推进成下一步行动。',
  openGraph: {
    title: '念生｜让值得实现的想法，真正发生',
    description: '从灵感捕获到验证、行动与复盘的完整想法工作流。',
    images: ['/og.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '念生｜让值得实现的想法，真正发生',
    description: '从灵感捕获到验证、行动与复盘的完整想法工作流。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
