import "./global.css";
export const metadata = {
  title: "Logus · Онлайн-занятия",
  description: "Учебное пространство для преподавателя и учеников",
  icons: { icon: "/logo.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
