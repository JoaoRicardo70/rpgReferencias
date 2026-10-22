import React, { Suspense } from 'react';
import TabPanel from './TabPanel';
import { abaPrecisaFicarMontada } from '../../core/navegacao';

// Uma aba do app: só existe enquanto está na tela (navegar fica leve e a aba nasce com dados frescos), exceto as que têm
// efeitos de fundo (core/navegacao.js > ABAS_SEMPRE_MONTADAS). O conteúdo é carregado sob demanda (React.lazy) na 1ª visita.
export default function AbaCarregavel({ id, children, className, sempreVisivel = false }) {
    return (
        <TabPanel id={id} className={className} sempreVisivel={sempreVisivel} descarregarAoSair={!abaPrecisaFicarMontada(id)}>
            <Suspense fallback={<div className="aba-carregando" role="status">Abrindo...</div>}>
                {children}
            </Suspense>
        </TabPanel>
    );
}
