import React from 'react';
import { MestreFormProvider, useMestreForm } from './MestreFormContext';
import {
    MestreAcessoNegado,
    MestreVisorJogadores,
    MestreInjetorEntidades,
    MestreVozSistema,
    MestreForjaNPC // Adicionámos a importação aqui!
} from './MestreSubComponents';

function MestreConteudoSeguro() {
    const ctx = useMestreForm();
    if (!ctx) return null;
    if (!ctx.isMestre) return <MestreAcessoNegado />;

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ color: '#ffcc00', textShadow: '0 0 10px #ffcc00', borderBottom: '2px solid #ffcc00', paddingBottom: 10, margin: 0 }}>
                👑 DOMÍNIO DO MESTRE
            </h2>
            
            {/* Primeira linha: Visor, Injetor Rápido e Voz do Sistema */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <MestreVisorJogadores />
                <div style={{ flex: '1 1 35%', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <MestreInjetorEntidades />
                    <MestreVozSistema />
                </div>
            </div>

            {/* Segunda linha inteira: A nossa nova Forja de Vilões */}
            <MestreForjaNPC />
            
        </div>
    );
}

export default function MestrePanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0
    return (
        <MestreFormProvider>
            <div className={className}>
                {hasChildren ? children : <MestreConteudoSeguro />}
            </div>
        </MestreFormProvider>
    );
}