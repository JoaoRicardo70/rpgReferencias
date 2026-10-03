import React, { useState, useCallback } from 'react';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import {
    AtaqueFuriaDisplay,
    AtaqueCriticoConfig,
    AtaqueElementoSelector, // 🔥 IMPORTADO AQUI
    AtaqueArmaEquipada,
    AtaqueArmaVazia,
    AtaqueHabilidadesAtivas,
    AtaqueMagiasPreparadas,
    AtaqueDanoCustomizado,
    AtaqueBotoesAcao
} from './AtaqueSubComponents';

// ⚙️ Única tela que define os Status e a Energia de combustão de cada habilidade/magia no dano —
// por isso recolhida (fechada por padrão) em vez de removida.
function AtaqueListasRecolhidas() {
    const ctx = useAtaqueForm();
    const [aberta, setAberta] = useState(false);
    const alternar = useCallback(() => setAberta(a => !a), []);
    const total = (ctx?.poderesAtivos?.length || 0) + (ctx?.magiasOfensivas?.length || 0);
    if (total === 0) return null;
    return (
        <div className="ataque-listas-recolhidas">
            <button type="button" className="btn-neon ataque-listas-toggle" onClick={alternar} aria-expanded={aberta} aria-controls="ataque-listas-conteudo">
                <span aria-hidden="true">{aberta ? '▾' : '▸'} ⚙️</span> Status das Habilidades Ativadas e Magias Preparadas ({total})
            </button>
            {aberta && (
                <div id="ataque-listas-conteudo">
                    <AtaqueHabilidadesAtivas />
                    <AtaqueMagiasPreparadas />
                </div>
            )}
        </div>
    );
}

export default function AtaquePanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0;
    return (
        <AtaqueFormProvider>
            <div className={['ataque-panel', className].filter(Boolean).join(' ')}>
                {hasChildren ? children : (
                    <>
                        <AtaqueFuriaDisplay />
                        
                        {/* 🔥 SELETOR DE ELEMENTO NO TOPO 🔥 */}
                        <AtaqueElementoSelector /> 

                        <AtaqueCriticoConfig />
                        <AtaqueArmaEquipada />
                        <AtaqueArmaVazia />
                        {/* Habilidades Ativadas e Magias Preparadas ficam recolhidas (pedido da mesa: listas
                            grandes demais). Continuam entrando no dano; abrir só pra trocar os Status/Energia. */}
                        <AtaqueListasRecolhidas />
                        <AtaqueDanoCustomizado />
                        <AtaqueBotoesAcao />
                    </>
                )}
            </div>
        </AtaqueFormProvider>
    );
}