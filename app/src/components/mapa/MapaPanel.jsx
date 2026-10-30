import React, { useState, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { lerMolduraOculta, gravarMolduraOculta } from '../../core/molduraMapa';
import { MapaFormProvider } from './MapaFormContext';
import { MapaDadoAnimado, MapaRolagemRapida, MapaIniciativaTracker, MapaHologramaAcao, MapaAtalhoAtaques } from './MapaCombate';
import { MapaFerramentasMestre } from './MapaFerramentasMestre';
import { MapaAreaCentral } from './MapaGrelha';
import { AtaqueFormProvider } from '../combate/AtaqueFormContext';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import { ArsenalFormProvider } from '../arsenal/ArsenalFormContext';
import { ElementosFormProvider } from '../arsenal/ElementosFormContext';
import { MapaSeletorAtor, MapaModulosDoAtor } from './MapaAtorCombate';

export default function MapaPanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0;
    // 🔥 O Mapa fica montado (escondido) mesmo fora de foco (core/navegacao.js > ABAS_SEMPRE_MONTADAS), então um
    // <AtaqueFormProvider> aqui rodaria PERMANENTEMENTE, dobrando efeitos de fundo do Ataque. Só monta este aqui quando
    // o Mapa realmente está em foco.
    const abaAtiva = useStore(s => s.abaAtiva);
    // (No modo Mesa, com um painel aberto ao lado, o Livro de Combate do Mapa fica de fora: os providers dele dobrariam os efeitos
    // do Ataque/Arsenal que o painel lateral já monta. Feche o painel pra voltar a usar o Livro.)
    const mapaEmFoco = abaAtiva === 'aba-mapa';
    // Quem quiser ver o mapa sem a moldura ao lado a esconde; a escolha fica guardada neste navegador.
    const [molduraOculta, setMolduraOculta] = useState(lerMolduraOculta);
    const alternarMoldura = useCallback(() => { gravarMolduraOculta(!molduraOculta); setMolduraOculta(!molduraOculta); }, [molduraOculta]);

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
                                                {/* Atalho flutuante (Livro de Combate): ataques salvos, Habilidades/Formas/Poderes e Técnicas Elementais — substitui os blocos que ficavam na tela do Mapa */}
                                                <ArsenalFormProvider>
                                                    <MapaAtalhoAtaques />
                                                </ArsenalFormProvider>
                                            </ElementosFormProvider>
                                        </PoderesFormProvider>
                                    </AtaqueFormProvider>
                                </MapaModulosDoAtor>
                            )}
                        </div>

                        {/* A moldura continua montada quando oculta (só some da tela), para não perder o que ela acompanha */}
                        <div className="mapa-moldura-coluna" hidden={molduraOculta}>
                            <button type="button" className="mapa-moldura-alternar" onClick={alternarMoldura} title="Esconder a moldura para ver o mapa com mais clareza" aria-label="Ocultar a moldura">▶ Ocultar moldura</button>
                            <div className="mapa-moldura-conteudo"><MapaHologramaAcao /></div>
                        </div>
                        {molduraOculta && (
                            <button type="button" className="mapa-moldura-alternar flutuante" onClick={alternarMoldura} title="Mostrar a moldura de novo" aria-label="Mostrar a moldura">◀ Moldura</button>
                        )}
                    </>
                )}
            </div>
        </MapaFormProvider>
    );
}