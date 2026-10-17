import React from 'react';
import useStore from '../../stores/useStore';
import { MapaFormProvider } from './MapaFormContext';
import { MapaDadoAnimado, MapaRolagemRapida, MapaIniciativaTracker, MapaHologramaAcao, MapaAtaquesSalvos, MapaAtalhoAtaques, MapaAtaqueArma, MapaTecnicasRapidas, MapaMagiasElementais } from './MapaCombate';
import { MapaFerramentasMestre } from './MapaFerramentasMestre';
import { MapaAreaCentral } from './MapaGrelha';
import { AtaqueFormProvider } from '../combate/AtaqueFormContext';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import { ArsenalFormProvider } from '../arsenal/ArsenalFormContext';
import { ElementosFormProvider } from '../arsenal/ElementosFormContext';
import { MapaSeletorAtor, MapaModulosDoAtor } from './MapaAtorCombate';

export default function MapaPanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0;
    // 🔥 Todas as abas ficam sempre montadas (ver TabPanel.jsx, display:none em vez de
    // desmontar) — então um <AtaqueFormProvider> aqui rodaria PERMANENTEMENTE em paralelo com a
    // instância que já vive, sempre montada, na aba Ataque (dobrando efeitos dela, como a Fúria
    // automática que salva no Firebase, pra todo mundo o tempo todo). Só monta este aqui quando
    // o Mapa realmente está em foco.
    const abaAtiva = useStore(s => s.abaAtiva);
    const mapaEmFoco = abaAtiva === 'aba-mapa';

    return (
        <MapaFormProvider>
            <div className={['mapa-panel', className].filter(Boolean).join(' ')} style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', position: 'relative' }}>
                
                {hasChildren ? children : (
                    <>
                        {/* MÓDULO DE COMBATE E ROLAGEM */}
                        <MapaDadoAnimado />
                        
                        <div style={{ flex: '1 1 70%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                            {/* MÓDULO DO MESTRE (ZONAS, CENAS, DUMMIES) */}
                            <MapaFerramentasMestre />
                            <MapaSeletorAtor />
                            
                            {/* MÓDULO VISUAL E COMUNICAÇÃO (GRELHA, 3D, VOZ E IA) */}
                            <MapaAreaCentral />
                            
                            {/* MÓDULO DE COMBATE RÁPIDO */}
                            <MapaRolagemRapida />
                            <MapaIniciativaTracker />
                            {mapaEmFoco && (
                                <MapaModulosDoAtor>
                                    <AtaqueFormProvider>
                                        <PoderesFormProvider>
                                            <ElementosFormProvider>
                                                <ArsenalFormProvider>
                                                    <MapaAtaqueArma />
                                                </ArsenalFormProvider>
                                                <MapaAtaquesSalvos />
                                                <MapaTecnicasRapidas />
                                                <MapaMagiasElementais />
                                                {/* Atalho flutuante (Livro): ataques salvos, técnicas e elementais num só lugar */}
                                                <MapaAtalhoAtaques />
                                            </ElementosFormProvider>
                                        </PoderesFormProvider>
                                    </AtaqueFormProvider>
                                </MapaModulosDoAtor>
                            )}
                        </div>

                        <div className="mapa-moldura-coluna">
                            <MapaHologramaAcao />
                        </div>
                    </>
                )}
            </div>
        </MapaFormProvider>
    );
}