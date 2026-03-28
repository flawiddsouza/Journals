<script>
import { onMount, onDestroy } from 'svelte'
import Chart from 'chart.js/auto'

export let type = 'bar'   // 'bar' | 'line' | 'pie'
export let labels = []
export let values = undefined   // number[] — single-series
export let series = undefined   // { label: string, values: number[] }[] — multi-series

let canvas
let chart

function getAccentColor() {
    return getComputedStyle(document.documentElement)
        .getPropertyValue('--color-pa-btn')
        .trim() || '#b06800'
}

function buildDatasets() {
    const accent = getAccentColor()
    const palette = [accent, accent + 'cc', accent + '99', accent + '66', accent + '44']
    if (series) {
        return series.map((s, i) => ({
            label: s.label,
            data: s.values,
            backgroundColor: palette[i % palette.length],
            borderColor: palette[i % palette.length],
            fill: false,
        }))
    }
    return [{
        data: values ?? [],
        backgroundColor: palette,
        borderColor: palette[0],
        fill: false,
        tension: 0.3,
    }]
}

onMount(() => {
    chart = new Chart(canvas, {
        type,
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: type === 'pie' || !!series },
            },
            scales: type === 'pie' ? {} : {
                x: { grid: { color: 'rgba(0,0,0,0.07)' } },
                y: { grid: { color: 'rgba(0,0,0,0.07)' } },
            },
        },
    })
    // Reassign to trigger the reactive block for initial data load
    chart = chart
})

$: if (chart) {
    chart.data.labels = labels
    chart.data.datasets = buildDatasets()
    chart.update()
}

onDestroy(() => chart?.destroy())
</script>

<canvas bind:this={canvas}></canvas>
