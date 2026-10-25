"""Interact with custom selects by their stable accessible label and option value."""
import json


def select_value(page, label, value):
    page.get_by_role('combobox', name=label, exact=True).click()
    popup = page.locator('.custom-select-popover')
    multiple = popup.get_by_role('listbox').get_attribute('aria-multiselectable') == 'true'
    if multiple:
        popup.get_by_role('button', name='清除选择', exact=True).click()
        if value != 'All':
            popup.locator('[role="option"][data-value=' + json.dumps(value, ensure_ascii=False) + ']').click()
        popup.get_by_role('listbox').press('Escape')
    else:
        popup.locator('[role="option"][data-value=' + json.dumps(value, ensure_ascii=False) + ']').click()
