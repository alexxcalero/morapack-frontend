import "./globals.css";
import { Jockey_One } from "next/font/google";
import Cabecera from "./components/Cabecera/Cabecera";
import EmotionProvider from "./EmotionProvider";
import PiePagina from "./components/PiePagina/PiePagina";

const jockeyOne = Jockey_One({
  subsets: ["latin"],
  weight: "400",
});

export const metadata = {
  description: "Sistema de planificación y gestión logística.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={`${jockeyOne.variable} antialiased`}>
        <EmotionProvider>
          <Cabecera />
          <main className="pb-16">{children}</main>
          <PiePagina />
        </EmotionProvider>
      </body>
    </html>
  );
}
