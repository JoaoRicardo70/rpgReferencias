import React from 'react';
import { FichaFormProvider } from './FichaFormContext';
import { 
    FichaBioGroup, 
    FichaSeresSelados, 
    FichaEditorAtributos, 
    FichaFuriaBerserker, 
    FichaMultiplicadoresDano 
} from './FichaSubComponents';
import TabelaPrestigio from './TabelaPrestigio';
import AbaDominios from './AbaDominios';

export default function FichaPanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0
    return (
        <FichaFormProvider>
            <div className={['ficha-panel', className].filter(Boolean).join(' ')}>
                {hasChildren ? children : (
                    <>
                        <FichaBioGroup />
                        
                        {/* Estados, Afinidades e Reduções de Dano agora vivem na página 3 do Grimório. */}
                        <FichaSeresSelados />
                        <FichaEditorAtributos />
                        <FichaFuriaBerserker />
                        <FichaMultiplicadoresDano />
                        
                        <AbaDominios /> 

                        <TabelaPrestigio />
                    </>
                )}
            </div>
        </FichaFormProvider>
    );
}