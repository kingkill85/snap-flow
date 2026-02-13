import { useState, useEffect } from 'react';
import { Card, TextInput, Select } from 'flowbite-react';
import { HiSearch } from 'react-icons/hi';
import type { Category } from '../../services/category';

interface SearchFilterProps {
  categories: Category[];
  onSearch: (search: string, categoryId: number | '') => void;
}

// COMPLETELY SEPARATE COMPONENT - manages its own state
// Parent only gets notified via onSearch after debounce
export default function SearchFilter({ categories, onSearch }: SearchFilterProps) {
  const [searchValue, setSearchValue] = useState('');
  const [categoryValue, setCategoryValue] = useState<number | ''>('');

  // Debounce and notify parent
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(searchValue, categoryValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, categoryValue, onSearch]);

  return (
    <Card>
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <TextInput
            type="text"
            placeholder="Search items..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            icon={HiSearch}
          />
        </div>
        <div className="w-48">
          <Select
            value={categoryValue}
            onChange={(e) => setCategoryValue(e.target.value ? parseInt(e.target.value) : '')}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Card>
  );
}
