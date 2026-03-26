import React, { forwardRef } from 'react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  id?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-navy-700">
            {label}
          </label>
        )}
        <select
          id={id}
          ref={ref}
          className={`border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${error ? 'border-red-500' : 'border-gray-300'} ${className || ''}`}
          {...props}
        >
          {children}
        </select>
        {error && (
          <span className="text-xs text-red-500">{error}</span>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

export default Select
