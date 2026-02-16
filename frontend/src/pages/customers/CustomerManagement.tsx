import { useState, useEffect } from 'react';
import { Button, Card, Table, Alert, Spinner, TextInput } from 'flowbite-react';
import { HiPlus, HiTrash, HiPencil, HiSearch } from 'react-icons/hi';
import { customerService, type Customer, type CreateCustomerDTO, type UpdateCustomerDTO } from '../../services/customer';
import { CustomerFormModal } from '../../components/customers/CustomerFormModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';
import axios from 'axios';

const CustomerManagement = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const fetchCustomers = async (search?: string, signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await customerService.getAll(search, signal);
      setCustomers(data);
      setError('');
    } catch (err: any) {
      if (!axios.isCancel(err) && err.name !== 'AbortError') {
        const errorData = err.response?.data?.error;
        let errorMessage: string;
        if (typeof errorData === 'object' && errorData !== null) {
          if (errorData.issues && Array.isArray(errorData.issues)) {
            errorMessage = errorData.issues.map((issue: any) => issue.message).join(', ');
          } else {
            errorMessage = JSON.stringify(errorData);
          }
        } else {
          errorMessage = errorData || err.message || 'Failed to fetch customers';
        }
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomers(searchQuery, controller.signal);
    
    return () => {
      controller.abort();
    };
  }, [searchQuery]);

  const handleSubmitCustomer = async (data: CreateCustomerDTO | UpdateCustomerDTO) => {
    if (customerToEdit) {
      await customerService.update(customerToEdit.id, data as UpdateCustomerDTO);
    } else {
      await customerService.create(data as CreateCustomerDTO);
    }
    fetchCustomers(searchQuery);
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    await customerService.delete(customerToDelete.id);
    fetchCustomers(searchQuery);
  };

  const openCreateModal = () => {
    setCustomerToEdit(null);
    setShowFormModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setCustomerToEdit(customer);
    setShowFormModal(true);
  };

  const openDeleteModal = (customer: Customer) => {
    setCustomerToDelete(customer);
    setShowDeleteModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your customers and their projects</p>
        </div>
        <Button onClick={openCreateModal}>
          <HiPlus className="mr-2 h-5 w-5" />
          Add Customer
        </Button>
      </div>

      {error && (
        <Alert color="failure" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Search */}
      <Card>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <TextInput
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={HiSearch}
            />
          </div>
        </div>
      </Card>

      {/* Customers Table */}
      <Card>
        <Table hoverable>
          <Table.Head>
            <Table.HeadCell>NAME</Table.HeadCell>
            <Table.HeadCell>EMAIL</Table.HeadCell>
            <Table.HeadCell>PHONE</Table.HeadCell>
            <Table.HeadCell>ADDRESS</Table.HeadCell>
            <Table.HeadCell className="w-32"></Table.HeadCell>
          </Table.Head>
          <Table.Body>
            {customers.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5} className="text-center py-8 text-gray-500">
                  No customers found. Create your first customer to get started.
                </Table.Cell>
              </Table.Row>
            ) : (
              customers.map((customer) => (
                <Table.Row key={customer.id} className="hover:bg-gray-50 transition-colors">
                  <Table.Cell className="font-medium">
                    {customer.name}
                  </Table.Cell>
                  <Table.Cell className="text-gray-600">{customer.email || '-'}</Table.Cell>
                  <Table.Cell className="text-gray-600">{customer.phone || '-'}</Table.Cell>
                  <Table.Cell className="max-w-xs truncate text-gray-600">{customer.address || '-'}</Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2 justify-end">
                      <Button
                        color="light"
                        size="xs"
                        onClick={() => openEditModal(customer)}
                      >
                        <HiPencil className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        color="failure"
                        size="xs"
                        onClick={() => openDeleteModal(customer)}
                      >
                        <HiTrash className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </Card>

      <CustomerFormModal
        customer={customerToEdit}
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setCustomerToEdit(null);
        }}
        onSubmit={handleSubmitCustomer}
      />

      <ConfirmDeleteModal
        title="Delete Customer"
        itemName={customerToDelete?.name || ''}
        warningText="This will permanently delete the customer. This action cannot be undone."
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setCustomerToDelete(null);
        }}
        onConfirm={handleDeleteCustomer}
      />
    </div>
  );
};

export default CustomerManagement;
