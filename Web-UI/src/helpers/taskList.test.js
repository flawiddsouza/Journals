import { describe, expect, test } from 'vitest'
import {
    countTaskItems,
    createEmptyTaskListDocument,
    taskTextToItems,
} from './taskList.js'

describe('taskTextToItems', () => {
    test('turns pasted lines into separate tasks', () => {
        const items = taskTextToItems('First\nSecond\nThird')

        expect(items.map((item) => item.content[0].content[0].text)).toEqual([
            'First',
            'Second',
            'Third',
        ])
    })

    test('keeps checkbox state and indentation', () => {
        const items = taskTextToItems(
            '- [x] Parent\n  - [ ] First child\n  - [x] Second child\n- [ ] Next',
        )

        expect(items).toHaveLength(2)
        expect(items[0].attrs.checked).toBe(true)
        expect(items[0].content).toHaveLength(2)
        expect(items[0].content[1].content).toHaveLength(2)
        expect(items[0].content[1].content[0].content[0].content[0].text).toBe(
            'First child',
        )
        expect(items[0].content[1].content[1].attrs.checked).toBe(true)
        expect(items[1].content[0].content[0].text).toBe('Next')
    })
})

test('the empty document starts with one editable task', () => {
    expect(countTaskItems(createEmptyTaskListDocument())).toEqual({
        total: 1,
        completed: 0,
    })
})
