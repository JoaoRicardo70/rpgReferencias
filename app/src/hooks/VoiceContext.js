import { createContext } from 'react';

// Contexto global da voz (Sala de Rádio da Party). Vive em arquivo próprio para que
// componentes como o GravadorPanel possam lê-lo sem importar o App inteiro.
export const VoiceContext = createContext(null);
