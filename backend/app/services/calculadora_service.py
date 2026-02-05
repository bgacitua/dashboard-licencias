"""
Motor de cálculo de sueldos.
Migrado y adaptado desde SERVICE/engine.py
"""
import math
from typing import List, Dict, Tuple
from app.core.calculadora_data import (
    VALOR_UF_ACTUAL, SUELDO_MINIMO, TASAS_AFP, PARAMETROS,
    TOPE_IMPONIBLE_AFP_SALUD, TOPE_IMPONIBLE_CESANTIA, TRAMOS_IMPUESTO
)
from app.schemas.calculadora import CalculoRequest, CalculoResponse, SimulacionRequest

class CalculadoraService:
    
    @staticmethod
    def redondear_a_miles_arriba(valor: float) -> int:
        """Redondea hacia arriba al siguiente múltiplo de 1000"""
        if valor <= 0:
            return 0
        return int(math.ceil(valor / 1000) * 1000)
    
    @staticmethod
    def calcular_impuesto_unico(base_tributable: float) -> float:
        """Calcula impuesto de segunda categoría según tramos"""
        if base_tributable <= 0:
            return 0.0
        
        for tramo in TRAMOS_IMPUESTO:
            if tramo['desde'] <= base_tributable <= tramo['hasta']:
                return (base_tributable * tramo['tasa']) - tramo['rebaja']
        
        # Tramo final (infinito)
        ultimo = TRAMOS_IMPUESTO[-1]
        if base_tributable > ultimo['desde']:
            return (base_tributable * ultimo['tasa']) - ultimo['rebaja']
        
        return 0.0
    
    def simular_liquido(self, sueldo_base: float, datos: dict) -> Tuple[float, dict]:
        """
        Simulación forward: dado un sueldo base, calcula el líquido resultante.
        """
        lista_bonos = datos.get('bonos', [])
        movilizacion = datos['movilizacion']
        
        bonos_imponibles = sum(b['monto'] for b in lista_bonos if b['imponible'])
        bonos_no_imponibles = sum(b['monto'] for b in lista_bonos if not b['imponible'])
        
        # Parámetros
        uf = VALOR_UF_ACTUAL
        ingreso_minimo = SUELDO_MINIMO
        tope_pesos_afp_salud = TOPE_IMPONIBLE_AFP_SALUD * uf
        tope_pesos_cesantia = TOPE_IMPONIBLE_CESANTIA * uf
        
        # Tasas
        tasa_afp = TASAS_AFP.get(datos['afp_nombre'], 0.1049)
        tasa_fonasa = PARAMETROS['tasa_salud']
        tasa_cesantia = PARAMETROS['tasa_cesantia']
        
        # Salud
        usar_fonasa = (datos['salud_sistema'] == 'fonasa')
        costo_plan_isapre = 0 if usar_fonasa else datos['salud_uf'] * uf
        
        # A. Gratificación
        tope_grat = (4.75 * ingreso_minimo) / 12
        gratificacion = min(sueldo_base * 0.25, tope_grat)
        
        # B. Total Imponible
        imponible = sueldo_base + gratificacion + bonos_imponibles
        
        # C. Aplicar Topes
        imp_afecto_afp_salud = min(imponible, tope_pesos_afp_salud)
        imp_afecto_cesantia = min(imponible, tope_pesos_cesantia)
        
        # D. Descuentos Previsionales
        val_afp = imp_afecto_afp_salud * tasa_afp
        val_cesantia = imp_afecto_cesantia * tasa_cesantia
        
        if usar_fonasa:
            val_salud = imp_afecto_afp_salud * tasa_fonasa
        else:
            siete_porciento = imp_afecto_afp_salud * tasa_fonasa
            val_salud = max(siete_porciento, costo_plan_isapre)
        
        # E. Impuesto
        base_trib = imponible - val_afp - val_salud - val_cesantia
        val_impuesto = self.calcular_impuesto_unico(base_trib)
        
        # F. Totales
        tot_haberes = imponible + movilizacion + bonos_no_imponibles
        tot_descuentos = val_afp + val_salud + val_cesantia + val_impuesto
        liquido = tot_haberes - tot_descuentos
        
        detalles = {
            "grat": gratificacion,
            "imp": imponible,
            "afp": val_afp,
            "salud": val_salud,
            "ces": val_cesantia,
            "tax": val_impuesto,
            "hab": tot_haberes,
            "desc": tot_descuentos,
            "base_trib": base_trib,
            "bonos_imp": bonos_imponibles,
            "bonos_no_imp": bonos_no_imponibles
        }
        
        return liquido, detalles
    
    def resolver_sueldo_base(self, request: CalculoRequest) -> CalculoResponse:
        """
        Algoritmo de búsqueda binaria para encontrar el sueldo base
        que produce el líquido deseado.
        """
        datos = {
            "movilizacion": request.movilizacion,
            "afp_nombre": request.afp_nombre,
            "salud_sistema": request.salud_sistema,
            "salud_uf": request.salud_uf,
            "bonos": [b.model_dump() for b in request.bonos]
        }
        
        liquido_objetivo = request.sueldo_liquido
        
        # Configuración búsqueda binaria
        precision = 1.0
        min_base = 0
        max_base = liquido_objetivo * 3.0
        iteraciones = 0
        
        # Expandir rango si es necesario
        while self.simular_liquido(max_base, datos)[0] < liquido_objetivo:
            max_base *= 2
            if max_base > 100_000_000:
                break
        
        # Búsqueda binaria
        base_exacta = 0
        while (max_base - min_base) > precision and iteraciones < 100:
            base_exacta = (min_base + max_base) / 2
            liquido_calc, _ = self.simular_liquido(base_exacta, datos)
            
            if liquido_calc < liquido_objetivo:
                min_base = base_exacta
            else:
                max_base = base_exacta
            
            iteraciones += 1
        
        # Redondear a miles
        sueldo_base_redondeado = self.redondear_a_miles_arriba(base_exacta)
        
        # Recalcular con sueldo redondeado
        liquido_real, d = self.simular_liquido(sueldo_base_redondeado, datos)
        
        bonos_imponibles = sum(b.monto for b in request.bonos if b.imponible)
        bonos_no_imponibles = sum(b.monto for b in request.bonos if not b.imponible)
        
        return CalculoResponse(
            sueldo_base=sueldo_base_redondeado,
            sueldo_liquido=round(liquido_real),
            gratificacion=round(d['grat']),
            bonos_imponibles=round(bonos_imponibles),
            bonos_no_imponibles=round(bonos_no_imponibles),
            movilizacion=request.movilizacion,
            imponible=round(d['imp']),
            total_haberes=round(d['hab']),
            cotizacion_previsional=round(d['afp']),
            cotizacion_salud=round(d['salud']),
            cesantia=round(d['ces']),
            impuesto=round(d['tax']),
            total_descuentos=round(d['desc']),
            diferencia=round(liquido_real - liquido_objetivo),
            redondeo_aplicado=sueldo_base_redondeado - round(base_exacta)
        )